
process INDEX {
    tag "$transcriptome.simpleName"
    container 'quay.io/nextflow/rnaseq-nf:v1.1'
    
    input:
    path transcriptome 

    output:
    path 'index' 

    script:
    """
    echo "Running salmon index"
    salmon index --threads $task.cpus -t $transcriptome -i index
    echo "Command done"
    ls -lR && sleep 60
    """
}
